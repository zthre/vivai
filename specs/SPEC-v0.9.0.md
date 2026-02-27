# SPEC v0.9.0 — Automatización de Pagos (Gateway)

## Objetivo
Eliminar el registro manual de pagos integrando un gateway de pagos. Cuando el inquilino paga online, un webhook actualiza automáticamente el estado en Firestore y genera el recibo, cerrando el ciclo operativo.

## Funcionalidades

- **Link de pago por unidad**: El admin genera un link de pago para el mes actual de una unidad.
- **Integración Stripe o PSE**: Según el mercado objetivo (internacional: Stripe / Colombia: PSE vía Wompi o PayU).
- **Webhook de confirmación**: Cloud Function que recibe el evento de pago exitoso y actualiza Firestore.
- **Recibo automático**: Al confirmar pago, se crea el documento en `payments` y se envía email con el recibo al inquilino.
- **Estado de pago en unidad**: La unidad muestra "Pago confirmado" o "Pendiente" del mes en curso.

## Modelo de Datos (Firestore)

```
paymentLinks/{linkId}
  - unitId: string
  - ownerId: string
  - amount: number
  - month: string                  — formato "YYYY-MM"
  - status: 'active' | 'paid' | 'expired'
  - gatewayProvider: 'stripe' | 'wompi' | 'payU'
  - externalId: string             — ID de la sesión/intención en el gateway
  - externalUrl: string            — URL del checkout del gateway
  - createdAt: Timestamp
  - paidAt: Timestamp | null

payments/{paymentId}
  + source: 'manual' | 'gateway'  — nuevo campo para distinguir el origen
  + gatewayTransactionId: string | null
```

## Arquitectura Angular

```
features/
  payments/
    payment-link-generator/
      payment-link-generator.component.ts  # Admin genera link para unidad/mes
    payment-status/
      payment-status.component.ts          # Inquilino ve estado de pago del mes
```

Cloud Functions:
```
functions/
  src/
    createPaymentLink.ts          # Callable: crea sesión en Stripe/Wompi
    stripeWebhook.ts              # HTTP trigger: recibe eventos de Stripe
    wompiWebhook.ts               # HTTP trigger: recibe eventos de Wompi
```

## Rutas

```
/properties/:id/units/:unitId/payment-link   → PaymentLinkGeneratorComponent
/tenant/pay                                  → PaymentStatusComponent (inquilino)
```

## Criterios de Aceptación

1. El admin puede generar un link de pago para cualquier unidad ocupada del mes actual.
2. Al inquilino pagar exitosamente, el webhook crea un documento en `payments` con `source: 'gateway'` en menos de 10 segundos.
3. El webhook valida la firma del gateway antes de procesar el evento (seguridad contra spoofing).
4. Si el webhook falla, el pago queda en estado `pending_webhook` y se reintenta hasta 3 veces.
5. El inquilino recibe email de confirmación con el recibo en PDF adjunto.
6. Un link de pago expira automáticamente a los 3 días si no se usa.

## Dependencias

```json
{
  "stripe": "^14.x"
}
```
O SDK de Wompi/PayU según mercado. Requiere variables de entorno en Cloud Functions.

## Bloquea
- v1.0.0 usa `source` y `gatewayTransactionId` para los reportes de rentabilidad.

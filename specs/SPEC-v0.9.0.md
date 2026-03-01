# SPEC v0.9.0 — Automatización de Pagos (Gateway)

## Objetivo
Eliminar el registro manual de pagos integrando un gateway de pagos. Cuando el inquilino paga online, un webhook actualiza automáticamente Firestore, genera el registro en `payments` y envía el recibo, cerrando el ciclo operativo. Primera versión con dinero real procesado.

---

## Qué hereda de versiones anteriores

- `payments` con `unitId`, `ownerId`, `amount`, `date` de v0.1.0. **Esta versión agrega `source` y `gatewayTransactionId`**.
- `units` con `tenantUid`, `rentPrice` de v0.5.0.
- `TenantPortalComponent` de v0.5.0 — agregar sección de pago del mes.
- Sistema de notificaciones de v0.8.0 — el webhook dispara email de confirmación de pago vía la colección `mail`.
- Cloud Functions ya configurado en v0.8.0 — se agregan nuevas funciones al mismo proyecto.

---

## Funcionalidades

### 1. Generación de link de pago (admin)
- En `UnitDetailComponent`: botón "Generar link de pago" (visible solo para el mes actual si no hay pago registrado).
- Al hacer clic: llama a la Cloud Function `createPaymentLink`, que crea una Checkout Session en Stripe y retorna la URL.
- El link se guarda en `paymentLinks` y se muestra al admin con botón "Copiar link".
- El admin comparte el link con el inquilino por cualquier medio.
- Un link activo expira en 3 días (`expiresAt`).

### 2. Flujo de pago del inquilino
- El inquilino recibe el link y abre el checkout de Stripe en su navegador (redirige a `stripe.com`).
- Paga con tarjeta (Stripe gestiona todo el flujo de PCI).
- Al completar el pago: Stripe redirige a `/tenant/pay/success?session_id=...`.
- `PaymentStatusComponent` muestra el estado: "Pago procesado" o "Procesando..." mientras el webhook confirma.

### 3. Webhook de confirmación
- `stripeWebhook` — Cloud Function HTTP trigger expuesto en una URL pública.
- Stripe envía el evento `checkout.session.completed` al webhook.
- La función:
  1. Valida la firma del evento con `stripe.webhooks.constructEvent(payload, sig, WEBHOOK_SECRET)`.
  2. Busca el `paymentLink` por `externalId` (session ID de Stripe).
  3. Crea el documento en `payments` con `source: 'gateway'` y `gatewayTransactionId`.
  4. Actualiza `paymentLinks/{linkId}.status = 'paid'`.
  5. Escribe en `mail` para enviar el recibo al inquilino.
- Si la firma es inválida: retorna `400` sin procesar.
- Si falla la escritura en Firestore: retorna `500` para que Stripe reintente (hasta 3 veces en 24h).

### 4. Recibo automático
- Al confirmar el pago, se escribe en la colección `mail` (Firebase Trigger Email):
  - Destinatario: `tenantEmail`.
  - Asunto: "Recibo de pago — {inmueble} {mes/año}".
  - Cuerpo: monto pagado, fecha, nombre del inmueble y unidad.

### 5. Estado de pago en la unidad
- `UnitDetailComponent` (admin) muestra chip "Pago confirmado - gateway" o "Pendiente" para el mes actual.
- `PaymentStatusComponent` (inquilino) muestra el estado del link activo y confirmación del pago.

### 6. Compatibilidad con pagos manuales
- El campo `source: 'manual' | 'gateway'` en `payments` diferencia el origen.
- Los pagos manuales (v0.1.0) siguen funcionando; el gateway es una opción adicional, no reemplaza.

---

## Modelo de Datos (Firestore)

```
paymentLinks/{linkId}
  - unitId: string
  - unitNumber: string          — desnormalizado
  - propertyId: string          — desnormalizado
  - propertyName: string        — desnormalizado
  - ownerId: string
  - tenantEmail: string         — para enviar recibo
  - amount: number              — = rentPrice de la unidad
  - month: string               — "YYYY-MM"
  - status: 'active' | 'paid' | 'expired'
  - gatewayProvider: 'stripe'
  - externalId: string          — Stripe Checkout Session ID
  - externalUrl: string         — URL del checkout de Stripe
  - createdAt: Timestamp
  - expiresAt: Timestamp        — createdAt + 3 días
  - paidAt: Timestamp | null

payments/{paymentId}
  + source: 'manual' | 'gateway'
  + gatewayTransactionId: string | null
  + paymentLinkId: string | null
```

---

## Arquitectura Angular

```
src/app/
  features/
    payments/
      payment-link-generator/
        payment-link-generator.component.ts  # Admin: genera y muestra el link copiable
      payment-status/
        payment-status.component.ts          # Inquilino: estado del pago del mes + confirmación

    units/
      unit-detail/
        unit-detail.component.ts             # Agregar botón "Generar link de pago" + estado del mes
```

Cloud Functions (en `functions/src/`):
```
createPaymentLink.ts    # Callable Function: crea Checkout Session en Stripe
stripeWebhook.ts        # HTTP trigger: recibe eventos de Stripe, escribe payment
expirePaymentLinks.ts   # Scheduled (diario): marca como 'expired' los links vencidos
```

---

## UX y Diseño

**UnitDetailComponent (admin) — sección pago del mes:**
```
┌──────────────────────────────────────────────────────┐
│  Pago de Febrero 2026                                │
│                                                      │
│  [Sin pago registrado]                               │
│                                                      │
│  [Registrar pago manual]   [Generar link de pago]   │
└──────────────────────────────────────────────────────┘
```

**Después de generar el link:**
```
┌──────────────────────────────────────────────────────┐
│  Link de pago activo                                 │
│  https://checkout.stripe.com/pay/cs_live_...         │
│  [Copiar link]   Expira: 1 mar 2026                 │
└──────────────────────────────────────────────────────┘
```

**PaymentStatusComponent (inquilino) — `/tenant/pay`:**
```
┌──────────────────────────────────────────────────────┐
│  Pago de Febrero 2026                                │
│  Edificio Los Robles — Unidad 302                   │
│  Monto: $1.200.000                                  │
│                                                      │
│  [Pagar con tarjeta →]   (abre checkout de Stripe)  │
└──────────────────────────────────────────────────────┘
```

**Página de éxito `/tenant/pay/success`:**
```
┌──────────────────────────────────────────────────────┐
│  ✓  Pago recibido                                    │
│  Tu pago de $1.200.000 fue procesado exitosamente.  │
│  Recibirás el recibo en tu correo.                  │
│  [Volver a Mi Arriendo]                             │
└──────────────────────────────────────────────────────┘
```

---

## Rutas

```
/properties/:id/units/:unitId/payment-link  → PaymentLinkGeneratorComponent (ownerGuard)
/tenant/pay                                 → PaymentStatusComponent (tenantGuard)
/tenant/pay/success                         → PaymentSuccessComponent (tenantGuard)
```

---

## Variables de entorno (Cloud Functions)

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=https://vivai.app              # URL base para success_url y cancel_url de Stripe
```

---

## Criterios de Aceptación

1. El admin puede generar un link de pago para cualquier unidad `status: 'ocupado'` del mes actual.
2. Solo puede existir un link `status: 'active'` por unidad y mes; intentar generar otro muestra error.
3. El webhook valida la firma de Stripe antes de procesar; una solicitud con firma inválida retorna `400` sin escribir en Firestore.
4. Al recibir `checkout.session.completed`, el webhook crea el documento en `payments` con `source: 'gateway'` en menos de 10 segundos.
5. Si el webhook falla (error en Firestore), retorna `500` y Stripe reintenta automáticamente.
6. El inquilino recibe email de confirmación después del pago exitoso.
7. Un link de pago expirado (> 3 días) muestra "Este link ha expirado" al intentar abrirlo.
8. El campo `source` en `payments` permite distinguir pagos manuales de gateway en reportes (v1.0.0).
9. Los pagos manuales registrados en v0.1.0 siguen funcionando sin cambios de comportamiento.
10. La página de éxito (`/tenant/pay/success`) muestra "Procesando..." si el webhook aún no confirmó el pago, y cambia a "Pago confirmado" cuando el documento aparece en Firestore (listener en tiempo real).

---

## Dependencias

```json
// functions/package.json
{
  "stripe": "^14.x"
}
```
Sin nuevas dependencias en el proyecto Angular (el checkout es externo a la app).

**Cuenta Stripe requerida**: modo live habilitado, cuenta bancaria vinculada.

---

## Bloquea

- **v1.0.0** (BI y Reportes) usa `source` y `gatewayTransactionId` para diferencial de reportes de rentabilidad y para calcular el porcentaje de pagos automatizados.

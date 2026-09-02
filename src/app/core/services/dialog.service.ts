import { Injectable, inject } from '@angular/core';
import { ComponentType } from '@angular/cdk/portal';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';

/**
 * Apertura de diálogos, con el foco resuelto.
 *
 * Angular Material 17 marca todo lo que queda detrás del diálogo con
 * `aria-hidden="true"`, pero lo hace ANTES de mover el foco al diálogo. En ese
 * instante el foco sigue en el botón que lo abrió, es decir dentro de la zona
 * que se acaba de declarar oculta — y Chrome, con razón, se niega a aplicar el
 * `aria-hidden`:
 *
 *   «Blocked aria-hidden on an element because its descendant retained focus.»
 *
 * No afecta a quien usa ratón o teclado, pero para quien navega con lector de
 * pantalla es real: el fondo se sigue anunciando, y el foco queda en un sitio
 * que se declaró invisible.
 *
 * Versiones posteriores de Material usan `inert`, que oculta y quita el foco a
 * la vez. Como el proyecto está fijado a v17, se resuelve soltando el foco antes
 * de abrir. Va aquí y no en cada llamada porque son dieciocho repartidas en
 * nueve componentes, y la que se olvide es la que vuelve a fallar.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private dialog = inject(MatDialog);

  // Los genéricos replican los de `MatDialog.open` —incluido el `any` de la
  // respuesta— para que sea un reemplazo directo en las llamadas existentes.
  open<T, D = any, R = any>(
    component: ComponentType<T>,
    config?: MatDialogConfig<D>
  ): MatDialogRef<T, R> {
    // El elemento activo suele ser el botón que disparó la apertura.
    (document.activeElement as HTMLElement | null)?.blur();

    return this.dialog.open<T, D, R>(component, {
      // Que el foco entre al diálogo, no que se quede fuera.
      autoFocus: 'dialog',
      ...config,
    });
  }
}

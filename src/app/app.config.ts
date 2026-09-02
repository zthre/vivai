import { APP_INITIALIZER, ApplicationConfig } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withNavigationErrorHandler,
} from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  provideFirestore,
} from '@angular/fire/firestore';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { MatIconRegistry } from '@angular/material/icon';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

/** Marca que ya se recargó, para no entrar en bucle si el fallo es otro. */
const RELOAD_FLAG = 'vivai_chunk_reload';

/**
 * Recupera la app cuando una pantalla no puede cargarse porque su trozo de
 * código ya no existe en el servidor.
 *
 * Pasa cuando se despliega con la pestaña abierta: el `index.html` que tiene el
 * navegador apunta a ficheros con hash de la versión anterior, y el despliegue
 * nuevo los reemplazó por otros. Al navegar a una ruta perezosa el import falla
 * con «Failed to fetch dynamically imported module» y la navegación se queda a
 * medias, sin nada que le diga al usuario qué pasó.
 *
 * Las cabeceras de caché de `firebase.json` evitan la causa —el `index.html` ya
 * no se cachea—, pero no rescatan a quien ya tenía la app abierta. Recargar
 * trae la versión nueva y la navegación continúa.
 *
 * La recarga se hace UNA vez por sesión: si el fallo fuera otro, un bucle de
 * recargas es peor que el error original.
 */
function recoverFromStaleChunk(error: unknown): void {
  const message = (error as Error)?.message ?? String(error);
  const isStaleChunk = /dynamically imported module|Importing a module script failed/i.test(message);

  if (!isStaleChunk) {
    console.error('[Router] Navegación fallida', error);
    return;
  }

  if (sessionStorage.getItem(RELOAD_FLAG)) {
    console.error('[Router] El trozo sigue sin cargar tras recargar', error);
    return;
  }

  sessionStorage.setItem(RELOAD_FLAG, '1');
  location.reload();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withComponentInputBinding(),
      withNavigationErrorHandler(recoverFromStaleChunk)
    ),
    provideAnimations(),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    /**
     * Caché persistente en IndexedDB.
     *
     * Sin ella, volver a una pantalla releía del servidor lo que se acababa de
     * leer, y una recarga de página empezaba de cero. `persistentMultipleTabManager`
     * es lo que permite tener la app abierta en varias pestañas: con el manager de
     * pestaña única, la segunda pestaña se queda sin caché.
     *
     * Si el navegador no admite IndexedDB (modo privado, almacenamiento bloqueado),
     * el SDK cae solo a caché en memoria; no hay que preverlo aquí.
     */
    provideFirestore(() =>
      initializeFirestore(getApp(), {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      })
    ),
    provideStorage(() => getStorage()),
    provideFunctions(() => getFunctions()),
    {
      provide: APP_INITIALIZER,
      useFactory: (iconRegistry: MatIconRegistry) => () => {
        iconRegistry.setDefaultFontSetClass('material-symbols-outlined');
      },
      deps: [MatIconRegistry],
      multi: true,
    },
  ],
};

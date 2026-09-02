import { APP_INITIALIZER, ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
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

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
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

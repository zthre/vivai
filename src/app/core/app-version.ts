import { version } from '../../../package.json';

/**
 * Versión mostrada en la UI. Se lee de package.json para que exista una sola
 * fuente de verdad: antes estaba escrita a mano en el sidebar y se quedó en
 * 1.2.2 durante toda la v1.3.0 sin que nadie lo notara.
 */
export const APP_VERSION: string = version;

import { Timestamp } from '@angular/fire/firestore';
import { ColaboradorPermission } from './property.model';

/**
 * Los permisos de un colaborador con un dueño, en un solo documento.
 *
 * Antes vivían replicados dentro de cada propiedad, en
 * `property.collaboratorPermissions[uid]`. Un colaborador en catorce inmuebles
 * eran catorce copias del mismo objeto, y cambiarle un permiso, catorce
 * escrituras — sin atomicidad, así que un fallo a mitad lo dejaba con permisos
 * distintos según la propiedad y nadie se enteraba.
 *
 * El id es determinista, `{ownerId}_{collaboratorUid}`, para que dar de alta dos
 * veces no cree dos documentos.
 */
export interface Collaborator {
  id?: string;
  ownerId: string;
  collaboratorUid: string;
  permissions: ColaboradorPermission;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** Id determinista de la relación entre un dueño y un colaborador. */
export function collaboratorId(ownerId: string, collaboratorUid: string): string {
  return `${ownerId}_${collaboratorUid}`;
}

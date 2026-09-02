import { Injectable, inject } from '@angular/core';
import { ColaboradorPermission, Property } from '../models/property.model';
import { AuthService } from './auth.service';
import { CollaboratorService } from '../services/collaborator.service';

/**
 * Permisos de colaborador, en un solo sitio.
 *
 * La regla es siempre la misma —el dueño puede todo; para un colaborador, un
 * permiso `undefined` cuenta como concedido (compatibilidad con documentos
 * anteriores al sistema de permisos)— pero estaba reescrita a mano veinte veces
 * repartidas en diez componentes, con dos redacciones distintas. Cualquier
 * cambio de semántica había que aplicarlo en diez archivos y acordarse de los
 * diez. Aquí vive una vez y el resto la consume.
 */

/** Las acciones que un permiso de colaborador puede recortar. */
export type PermissionKey = keyof ColaboradorPermission;

/**
 * Lo que recibe un colaborador nuevo: acceso completo, recortable después.
 *
 * Estaba escrito tres veces como literal en `PropertyService`, y ninguna de las
 * tres incluía `servicios`: el permiso quedaba `undefined` y funcionaba por la
 * regla de compatibilidad, no porque se hubiera concedido.
 */
export const DEFAULT_COLABORADOR_PERMISSIONS: Required<ColaboradorPermission> = {
  inmueblesUnidades: true,
  inmueblesPagos: true,
  inmueblesMedia: true,
  gastos: true,
  tickets: true,
  servicios: true,
};

/**
 * ¿Puede `uid` ejecutar `key` sobre esta propiedad?
 *
 * El dueño siempre puede. Para el resto se mira su entrada en
 * `collaboratorPermissions`: si no existe, o el campo no está explícitamente en
 * `false`, se concede.
 */
export function hasPermission(
  property: Property | null | undefined,
  uid: string | null | undefined,
  key: PermissionKey
): boolean {
  if (!uid || !property) return false;
  if (property.ownerId === uid) return true;
  const perms = property.collaboratorPermissions?.[uid];
  return !perms || perms[key] !== false;
}

/** ¿Puede `uid` ejecutar `key` sobre al menos una de estas propiedades? */
export function hasPermissionOnAny(
  properties: readonly Property[],
  uid: string | null | undefined,
  key: PermissionKey
): boolean {
  if (!uid) return false;
  return properties.some(p => hasPermission(p, uid, key));
}

/** Las propiedades sobre las que `uid` puede ejecutar `key`. */
export function propertiesWithPermission(
  properties: readonly Property[],
  uid: string | null | undefined,
  key: PermissionKey
): Property[] {
  if (!uid) return [];
  return properties.filter(p => hasPermission(p, uid, key));
}

/**
 * Las mismas comprobaciones, ya resueltas contra el usuario en sesión.
 * Pensado para consumirse dentro de un `computed()`: lee señales, así que la
 * vista se recalcula sola al cambiar de sesión o de permisos.
 *
 * Los permisos salen de la colección `collaborators`, un documento por pareja
 * dueño-colaborador. Si no hay documento —un colaborador anterior a la
 * migración— se cae al mapa que vive dentro de la propiedad, que es de donde
 * venían. Ese respaldo es lo que permite desplegar sin esperar al backfill.
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private auth = inject(AuthService);
  private collaborators = inject(CollaboratorService);

  can(property: Property | null | undefined, key: PermissionKey): boolean {
    const uid = this.auth.uid();
    if (!uid || !property) return false;
    if (property.ownerId === uid) return true;

    const global = this.collaborators.permissionsByOwner().get(property.ownerId);
    if (global) return global[key] !== false;

    return hasPermission(property, uid, key);
  }

  canOnAny(properties: readonly Property[], key: PermissionKey): boolean {
    return properties.some(p => this.can(p, key));
  }

  filterByPermission(properties: readonly Property[], key: PermissionKey): Property[] {
    return properties.filter(p => this.can(p, key));
  }

  isOwnerOf(property: Property | null | undefined): boolean {
    const uid = this.auth.uid();
    return !!uid && !!property && property.ownerId === uid;
  }
}

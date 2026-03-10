import { rolesGuard } from './roles.guard';

// Tenant guard: only allows 'tenant' role
export const tenantGuard = rolesGuard(['tenant']);

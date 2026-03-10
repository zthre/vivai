import { rolesGuard } from './roles.guard';

// Owner guard: allows 'owner' and 'colaborador' (colabs have full admin access to their properties)
export const ownerGuard = rolesGuard(['owner', 'colaborador']);

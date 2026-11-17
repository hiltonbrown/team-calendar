import { createAccessControl } from "better-auth/plugins/access";
import { rolePermissions, statement } from "./permissions";

export const accessControl = createAccessControl(statement);
export const organizationRoles = {
  admin: accessControl.newRole(rolePermissions.admin),
  manager: accessControl.newRole(rolePermissions.manager),
  owner: accessControl.newRole(rolePermissions.owner),
  viewer: accessControl.newRole(rolePermissions.viewer),
};

/** Permission levels the API reports for the signed-in user. */
export enum Permission {
  VIEWER = "Viewer",
  USER = "User",
  SUPERUSER = "Superuser",
  ADMIN = "Admin",
}

/**
 * The signed-in user, as returned by GET /users/me.
 *
 * Permissions come from the API rather than being decoded out of the access
 * token in the browser: the API reads them from the token it has already
 * verified, so the two can never disagree.
 */
export interface CurrentUser {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
  email_address?: string;
  contact_number?: string;
  auth_guid: string;
  last_login_at?: string;
  is_active: boolean;
  permissions: Permission[];
}

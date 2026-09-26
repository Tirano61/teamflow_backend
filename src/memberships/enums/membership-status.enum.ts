export enum MembershipStatus {
	ACTIVE = 'ACTIVE',
	SUSPENDED = 'SUSPENDED',
	/// El propio usuario abandono voluntariamente la organization (`POST /organizations/:organizationId/leave`).
	/// La Membership no se elimina: conserva identidad e historial y puede volver a ser invitada (LEFT -> ACTIVE).
	LEFT = 'LEFT',
}

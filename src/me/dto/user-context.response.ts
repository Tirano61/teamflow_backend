export interface UserContextOrganizationResponse {
	id: string;
	name: string;
	slug: string;
	role: string;
	joinedAt?: Date;
}

export interface PendingInvitationResponse {
	invitationId: string;
	organizationId: string;
	organizationName: string;
	organizationSlug: string;
	role: string;
	expiresAt: Date;
	token: string;
}

export interface UserContextResponse {
	user: {
		id: string;
		email: string;
		fullName: string;
	};
	organizations: UserContextOrganizationResponse[];
	pendingInvitations: PendingInvitationResponse[];
	organizationCount: number;
}

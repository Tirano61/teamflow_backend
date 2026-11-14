import { Discussion } from '../entities/discussion.entity';
import { DiscussionStatus } from '../enums/discussion-status.enum';

export interface DiscussionListPageInfo {
	/** Cursor para pedir la pagina siguiente; `null` cuando no hay mas resultados. */
	nextCursor: string | null;
	hasNextPage: boolean;
}

export interface DiscussionListSummary {
	/** Discussions que cumplen todos los filtros de la peticion (incluido `status`). */
	total: number;
	/**
	 * Discussions por status que cumplen todos los filtros excepto `status`. Siempre incluye todos
	 * los status, con 0 cuando no hay ninguna.
	 */
	byStatus: Record<DiscussionStatus, number>;
}

export interface DiscussionListResponse {
	/** Solo la pagina solicitada. */
	items: Discussion[];
	pageInfo: DiscussionListPageInfo;
	/** Contadores globales; solo en la primera pagina (peticion sin `cursor`), `null` en el resto. */
	summary: DiscussionListSummary | null;
}

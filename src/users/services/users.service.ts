import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { UserSearchResponse } from '../dto/user-search.response';

export const USER_SEARCH_MIN_QUERY_LENGTH = 2;
export const USER_SEARCH_DEFAULT_LIMIT = 10;
export const USER_SEARCH_MAX_LIMIT = 25;

@Injectable()
export class UsersService {
	constructor(
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
	) {}

	/// Escapa los comodines de LIKE para que la busqueda sea literal.
	private escapeLikeTerm(value: string): string {
		return value.replace(/[\\%_]/g, (character) => `\\${character}`);
	}

	private normalizeLimit(limit?: number): number {
		if (limit === undefined || limit === null || Number.isNaN(limit)) {
			return USER_SEARCH_DEFAULT_LIMIT;
		}

		if (limit < 1) return USER_SEARCH_DEFAULT_LIMIT;

		return Math.min(Math.trunc(limit), USER_SEARCH_MAX_LIMIT);
	}

	/**
	 * Busca usuarios registrados por email o fullName.
	 * No retorna password ni roles: solo los datos minimos para seleccionar un usuario.
	 */
	async searchUsers(
		query: string,
		currentUser: User,
		limit?: number,
	): Promise<UserSearchResponse[]> {
		const normalizedQuery = (query ?? '').trim();

		if (normalizedQuery.length < USER_SEARCH_MIN_QUERY_LENGTH) {
			throw new BadRequestException(
				`Query must have at least ${USER_SEARCH_MIN_QUERY_LENGTH} characters`,
			);
		}

		const term = `%${this.escapeLikeTerm(normalizedQuery)}%`;

		return this.userRepository
			.createQueryBuilder('user')
			.select(['user.id', 'user.email', 'user.fullName'])
			.where('user.isActive = true')
			.andWhere('user.id != :currentUserId', { currentUserId: currentUser.id })
			.andWhere(
				"(user.email ILIKE :term ESCAPE '\\' OR user.fullName ILIKE :term ESCAPE '\\')",
				{ term },
			)
			.orderBy('user.fullName', 'ASC')
			.limit(this.normalizeLimit(limit))
			.getMany();
	}
}

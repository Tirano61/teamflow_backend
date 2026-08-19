import {
	Injectable,
	InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
	UploadApiErrorResponse,
	UploadApiResponse,
	v2 as cloudinary,
} from 'cloudinary';

export interface CloudinaryUploadResult {
	url: string;
	publicId: string;
	bytes: number;
	resourceType: string;
}

export interface CloudinaryDeleteResult {
	result: string;
}

@Injectable()
export class CloudinaryService {
	private readonly isConfigured: boolean;
	private readonly defaultFolder: string;

	constructor(private readonly configService: ConfigService) {
		const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
		const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
		const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

		this.defaultFolder =
			this.configService.get<string>('CLOUDINARY_WORKSPACE_FOLDER') ??
			'workspace';

		this.isConfigured = Boolean(cloudName && apiKey && apiSecret);

		if (this.isConfigured) {
			cloudinary.config({
				cloud_name: cloudName,
				api_key: apiKey,
				api_secret: apiSecret,
				secure: true,
			});
		}
	}

	private ensureConfigured(): void {
		if (!this.isConfigured) {
			throw new InternalServerErrorException(
				'Cloudinary is not configured in environment variables',
			);
		}
	}

	async uploadDiscussionAttachment(options: {
		buffer: Buffer;
		filename: string;
		resourceType: 'image' | 'video' | 'raw' | 'auto';
	}): Promise<CloudinaryUploadResult> {
		this.ensureConfigured();

		const uploadResult = await new Promise<UploadApiResponse>(
			(resolve, reject) => {
				const uploadStream = cloudinary.uploader.upload_stream(
					{
						folder: this.defaultFolder,
						resource_type: options.resourceType,
						use_filename: false,
						unique_filename: true,
						overwrite: false,
						filename_override: options.filename,
					},
					(error: UploadApiErrorResponse | undefined, result) => {
						if (error || !result) {
							reject(
								new InternalServerErrorException(
									'Cloudinary upload failed',
								),
							);
							return;
						}
						resolve(result);
					},
				);

				uploadStream.end(options.buffer);
			},
		);

		return {
			url: uploadResult.secure_url,
			publicId: uploadResult.public_id,
			bytes: uploadResult.bytes,
			resourceType: uploadResult.resource_type,
		};
	}

	async deleteAsset(
		publicId: string,
		resourceType: string,
	): Promise<CloudinaryDeleteResult | null> {
		if (!publicId) return null;
		this.ensureConfigured();

		const destroyResult = await cloudinary.uploader.destroy(publicId, {
			resource_type: resourceType,
		});

		return {
			result: String((destroyResult as { result?: unknown }).result ?? ''),
		};
	}
}

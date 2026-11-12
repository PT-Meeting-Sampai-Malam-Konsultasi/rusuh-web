import type { UpdateProfileRequest, User } from '@core/entities/auth/auth.entity';
import type { HttpResponse } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface AccountServiceInterface {
  /** `GET /auth/profile` (Apidog alias of `GET /me`, the one the auth service serves): the signed-in profile. */
  getMe: () => Promise<HttpResponse<User>>;
  /** `PUT /auth/profile`: name and language; the account holds no NIK (D17). 400 VALIDATION_FAILED. */
  updateProfile: (body: UpdateProfileRequest) => Promise<HttpResponse<User>>;
}

export const AccountService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): AccountServiceInterface => ({
  getMe: () => coreHttp.get<User>('auth/profile'),
  updateProfile: (body) => coreHttp.put<User, UpdateProfileRequest>('auth/profile', body),
});

import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleAuthDto {
  @IsString({ message: 'Access token must be a string' })
  @IsNotEmpty({ message: 'Google access token is required' })
  accessToken: string;
}

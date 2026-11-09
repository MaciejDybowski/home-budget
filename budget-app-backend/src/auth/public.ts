import { SetMetadata } from '@nestjs/common';
export const PUBLIC_AUTH = 'homebudget:public';
export const Public = () => SetMetadata(PUBLIC_AUTH, true);

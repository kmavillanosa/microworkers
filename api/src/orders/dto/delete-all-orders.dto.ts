import { IsIn, IsString } from 'class-validator'

/** Body for delete-all-orders; requires explicit confirmation string to avoid accidents. */
export class DeleteAllOrdersDto {
	@IsString()
	@IsIn(['DELETE_ALL_ORDERS'])
	confirm!: string
}

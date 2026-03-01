import { IsIn } from 'class-validator'

export class SetOrderStatusDto {
	@IsIn(['pending', 'accepted', 'declined', 'processing', 'ready_for_sending', 'closed'])
	orderStatus: 'pending' | 'accepted' | 'declined' | 'processing' | 'ready_for_sending' | 'closed'
}

import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;
}

export class UpdateNoteDto extends CreateNoteDto {}

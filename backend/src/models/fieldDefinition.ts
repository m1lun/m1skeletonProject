// A custom field a user created and can reuse on later posts.
import type { FieldType } from './common';

export const FIELD_DEFINITIONS_COLLECTION = 'fieldDefinitions';

export interface FieldDefinition {
  ownerId: string;
  key: string;
  label: string;
  type: FieldType;
}

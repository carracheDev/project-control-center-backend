import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class TrimStringsPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!['body', 'query', 'param'].includes(metadata.type)) return value;
    return this.trimValue(value);
  }

  private trimValue(value: unknown): unknown {
    if (typeof value === 'string') return value.trim() || undefined;
    if (Array.isArray(value)) return value.map((item) => this.trimValue(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.trimValue(item)]));
    }
    return value;
  }
}
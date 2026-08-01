export interface Parser<TInput, TOutput> {
  parse(input: TInput): TOutput;
}

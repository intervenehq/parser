export type ItemMetadata = Record<string, string | number | boolean>;

export interface IVectorStoreItem {
  id: string;
  embeddings: number[];
  metadata: ItemMetadata;
}

export default class VectorStoreItem<ProviderItemT = undefined> {
  metadata?: ItemMetadata;
  object!: ProviderItemT extends undefined ? undefined : ProviderItemT;
  id: string;
  embeddings: number[];

  constructor(
    props: IVectorStoreItem &
      (ProviderItemT extends undefined
        ? {}
        : {
            object: ProviderItemT;
          })
  ) {
    this.id = props.id;
    this.embeddings = props.embeddings;
    this.metadata = props.metadata;

    if ("object" in props) {
      this.object = props.object as any;
    }
  }
}

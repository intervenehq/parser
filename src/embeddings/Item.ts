import { SetRequired } from "type-fest";

export type ItemMetadata = Record<string, string | number | boolean>;

export interface IVectorStoreItem<Metadata = ItemMetadata> {
  id: string;
  embeddings: number[];
  metadata: Metadata;
  distance?: number;
}

export default class VectorStoreItem<
  ProviderItemT = undefined,
  Metadata extends ItemMetadata = ItemMetadata
> {
  metadata?: Metadata;
  object!: ProviderItemT extends undefined ? undefined : ProviderItemT;
  id: string;
  embeddings: number[];
  distance: number;

  constructor(
    props: SetRequired<IVectorStoreItem<Metadata>, "distance"> &
      (ProviderItemT extends undefined
        ? {}
        : {
            object: ProviderItemT;
          })
  ) {
    this.id = props.id;
    this.embeddings = props.embeddings;
    this.metadata = props.metadata;
    this.distance = props.distance;

    if ("object" in props) {
      this.object = props.object as any;
    }
  }
}

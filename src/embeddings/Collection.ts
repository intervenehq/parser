export interface IVectorStoreCollection {
  metadata?: Record<string, any>;
  name: string;
}

export default class VectorStoreCollection<ProviderCollectionT = any> {
  object: ProviderCollectionT;
  metadata?: Record<string, any>;
  name: string;

  constructor(props: IVectorStoreCollection & { object: ProviderCollectionT }) {
    this.name = props.name;
    this.object = props.object;
    this.metadata = props.metadata;
  }
}

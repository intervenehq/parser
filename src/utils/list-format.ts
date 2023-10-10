const intl = new Intl.ListFormat();

function formatList(list: Iterable<string>) {
  return intl.format(list);
}

export { formatList };

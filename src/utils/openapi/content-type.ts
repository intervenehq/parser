export function getDefaultContentType(types: string[]) {
  if (types.includes('application/json')) return 'application/json';
  if (types.includes('application/x-www-form-urlencoded'))
    return 'application/x-www-form-urlencoded';
  if (types.includes('multipart/form-data')) return 'multipart/form-data';

  return types[0];
}

import { describe, expect, it } from 'vitest';
import { collectGalleryFolderIds, type GalleryFolder } from './useGallery';

function folder(id: string, parent_folder_id: string | null): GalleryFolder {
  return {
    id,
    parent_folder_id,
    user_id: 'user',
    name: id,
    created_at: '2026-08-10T00:00:00.000Z',
    updated_at: '2026-08-10T00:00:00.000Z',
  };
}

describe('collectGalleryFolderIds', () => {
  it('includes every nested descendant and excludes unrelated branches', () => {
    const folders = [
      folder('root', null),
      folder('child', 'root'),
      folder('grandchild', 'child'),
      folder('other', null),
    ];

    expect([...collectGalleryFolderIds(folders, 'root')].sort())
      .toEqual(['child', 'grandchild', 'root']);
  });

  it('terminates safely if corrupt data already contains a cycle', () => {
    const folders = [folder('a', 'b'), folder('b', 'a')];
    expect([...collectGalleryFolderIds(folders, 'a')].sort()).toEqual(['a', 'b']);
  });
});

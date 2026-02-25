export interface FolderItem {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
}

export interface FileItem {
  id: string;
  original_name: string;
  size_bytes: number;
  created_at: number;
  file_kind: 'image' | 'video' | 'audio' | 'document' | 'other';
  thumbnail_base64?: string;
}

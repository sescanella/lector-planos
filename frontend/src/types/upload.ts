export type UploadFileStatus = 'pending' | 'uploading' | 'completed' | 'failed';

export interface UploadFile {
  id: string;
  file: File;
  status: UploadFileStatus;
  progress: number;
  error?: string;
  retries: number;
}

export interface UploadQueueState {
  files: UploadFile[];
  isUploading: boolean;
  completedCount: number;
  failedCount: number;
  totalCount: number;
}

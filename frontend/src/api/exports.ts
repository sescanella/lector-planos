import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import {
  ExportListSchema,
  ExportSchema,
  CreateExportSchema,
  type ExportListResponse,
  type Export,
} from '@/types/api';
import { POLLING_INTERVALS, STALE_TIMES } from '@/constants';

export function useExports(jobId: string) {
  return useQuery<ExportListResponse>({
    queryKey: ['exports', jobId],
    queryFn: async () => {
      const data = await apiClient.get(`api/v1/jobs/${jobId}/export`).json();
      return ExportListSchema.parse(data);
    },
    staleTime: STALE_TIMES.EXPORT_COMPLETED,
    refetchOnWindowFocus: true,
    enabled: !!jobId,
  });
}

export function useExportStatus(jobId: string, exportId: string | null) {
  return useQuery<Export>({
    queryKey: ['export', jobId, exportId],
    queryFn: async () => {
      const data = await apiClient.get(`api/v1/jobs/${jobId}/export/${exportId}`).json();
      return ExportSchema.parse(data);
    },
    staleTime: STALE_TIMES.EXPORT_IN_FLIGHT,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' || status === 'processing'
        ? POLLING_INTERVALS.EXPORT_IN_FLIGHT
        : false;
    },
    refetchOnWindowFocus: true,
    enabled: !!jobId && !!exportId,
  });
}

export function useCreateExport(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation<Export, Error, { include_confidence?: boolean }>({
    mutationFn: async (body) => {
      const data = await apiClient.post(`api/v1/jobs/${jobId}/export`, {
        json: body,
      }).json();
      return CreateExportSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exports', jobId] });
    },
  });
}

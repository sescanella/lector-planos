import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import {
  SpoolListSchema,
  SpoolDetailSchema,
  CorrectionResponseSchema,
  type SpoolListResponse,
  type SpoolDetail,
  type CorrectionRequest,
  type CorrectionResponse,
} from '@/types/api';
import { STALE_TIMES, PAGE_SIZE } from '@/constants';

export function useSpools(jobId: string, page: number = 1) {
  return useQuery<SpoolListResponse>({
    queryKey: ['spools', jobId, page],
    queryFn: async () => {
      const data = await apiClient.get(`api/v1/jobs/${jobId}/spools`, {
        searchParams: { page, limit: PAGE_SIZE },
      }).json();
      return SpoolListSchema.parse(data);
    },
    staleTime: STALE_TIMES.JOB,
    refetchOnWindowFocus: true,
    enabled: !!jobId,
  });
}

export function useSpool(spoolId: string) {
  return useQuery<SpoolDetail>({
    queryKey: ['spool', spoolId],
    queryFn: async () => {
      const data = await apiClient.get(`api/v1/spools/${spoolId}`).json();
      return SpoolDetailSchema.parse(data);
    },
    staleTime: STALE_TIMES.SPOOL,
    refetchOnWindowFocus: true,
    enabled: !!spoolId,
  });
}

export function useCorrection(spoolId: string) {
  const queryClient = useQueryClient();
  return useMutation<CorrectionResponse, Error, CorrectionRequest, { previous: SpoolDetail | undefined }>({
    mutationFn: async (correction) => {
      const data = await apiClient.post(`api/v1/spools/${spoolId}/corrections`, {
        json: correction,
      }).json();
      return CorrectionResponseSchema.parse(data);
    },

    onMutate: async (correction) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['spool', spoolId] });

      // Snapshot current data for rollback
      const previous = queryClient.getQueryData<SpoolDetail>(['spool', spoolId]);

      // Optimistically update the cache
      queryClient.setQueryData<SpoolDetail>(['spool', spoolId], (old) => {
        if (!old) return old;

        const { field_type, field_id, original_value, corrected_value } = correction;

        const updateRawData = (raw: Record<string, unknown>): Record<string, unknown> => {
          const updated = { ...raw };
          for (const key of Object.keys(updated)) {
            if (String(updated[key]) === original_value) {
              updated[key] = corrected_value;
            }
          }
          return updated;
        };

        if (field_type === 'material') {
          return {
            ...old,
            materials: old.materials.map((m) =>
              m.material_id === field_id ? { ...m, raw_data: updateRawData(m.raw_data) } : m,
            ),
          };
        }

        if (field_type === 'union') {
          return {
            ...old,
            unions: old.unions.map((u) =>
              u.union_id === field_id ? { ...u, raw_data: updateRawData(u.raw_data) } : u,
            ),
          };
        }

        if (field_type === 'cut') {
          return {
            ...old,
            cuts: old.cuts.map((c) =>
              c.cut_id === field_id ? { ...c, raw_data: updateRawData(c.raw_data) } : c,
            ),
          };
        }

        if (field_type === 'metadata' && old.metadata) {
          return {
            ...old,
            metadata: { ...old.metadata, raw_data: updateRawData(old.metadata.raw_data) },
          };
        }

        return old;
      });

      return { previous };
    },

    onError: (_err, _correction, context) => {
      // Rollback to the snapshot on error
      if (context?.previous) {
        queryClient.setQueryData(['spool', spoolId], context.previous);
      }
    },

    onSettled: () => {
      // Always refetch after mutation to ensure server state
      void queryClient.invalidateQueries({ queryKey: ['spool', spoolId] });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import {
  JobListSchema,
  JobDetailSchema,
  CreateJobSchema,
  type JobListResponse,
  type JobDetail,
  type CreateJobResponse,
} from '@/types/api';
import { POLLING_INTERVALS, STALE_TIMES, PAGE_SIZE } from '@/constants';

export function useJobs(page: number = 1) {
  return useQuery<JobListResponse>({
    queryKey: ['jobs', page],
    queryFn: async () => {
      const data = await apiClient.get('api/v1/jobs', {
        searchParams: { page, limit: PAGE_SIZE },
      }).json();
      return JobListSchema.parse(data);
    },
    staleTime: STALE_TIMES.JOB,
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs;
      const hasProcessing = jobs?.some(j => j.status === 'processing' || j.status === 'pending');
      return hasProcessing ? POLLING_INTERVALS.JOBS_PROCESSING : false;
    },
    refetchOnWindowFocus: true,
  });
}

export function useJob(jobId: string) {
  return useQuery<JobDetail>({
    queryKey: ['job', jobId],
    queryFn: async () => {
      const data = await apiClient.get(`api/v1/jobs/${jobId}`).json();
      return JobDetailSchema.parse(data);
    },
    staleTime: STALE_TIMES.JOB,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'processing' || status === 'pending'
        ? POLLING_INTERVALS.JOB_DETAIL_PROCESSING
        : false;
    },
    refetchOnWindowFocus: true,
    enabled: !!jobId,
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation<CreateJobResponse, Error, { name?: string }>({
    mutationFn: async (params) => {
      const data = await apiClient.post('api/v1/jobs', {
        json: params?.name ? { name: params.name } : undefined,
      }).json();
      return CreateJobSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

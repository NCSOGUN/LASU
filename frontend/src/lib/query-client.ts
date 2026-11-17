import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/errors";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (!(error instanceof ApiError)) return false;
        return failureCount < 2 && error.status >= 500 && error.status !== 503;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

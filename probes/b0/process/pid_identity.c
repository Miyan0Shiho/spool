#include <errno.h>
#include <libproc.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/proc_info.h>
#include <sys/types.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc != 2) {
    fprintf(stderr, "usage: %s PID\n", argv[0]);
    return 64;
  }

  errno = 0;
  char *end = NULL;
  long parsed = strtol(argv[1], &end, 10);
  if (errno != 0 || end == argv[1] || *end != '\0' || parsed <= 0) {
    fprintf(stderr, "invalid pid: %s\n", argv[1]);
    return 64;
  }

  pid_t pid = (pid_t)parsed;
  struct proc_bsdinfo info;
  memset(&info, 0, sizeof(info));
  int rc = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info));
  if (rc != (int)sizeof(info)) {
    fprintf(stderr, "proc_pidinfo failed: pid=%d rc=%d errno=%d (%s)\n",
            pid, rc, errno, strerror(errno));
    return 1;
  }

  printf("pid=%u ppid=%u pgid=%u start_sec=%llu start_usec=%llu status=%u comm=%s\n",
         info.pbi_pid, info.pbi_ppid, info.pbi_pgid,
         (unsigned long long)info.pbi_start_tvsec,
         (unsigned long long)info.pbi_start_tvusec,
         info.pbi_status,
         info.pbi_comm);
  return 0;
}

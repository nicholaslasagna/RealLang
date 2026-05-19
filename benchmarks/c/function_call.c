#include <stdio.h>

static volatile int bench_limit = 50000;

static int inc(int x) { return x + 1; }

int main(void) {
  volatile int i = 0;
  volatile int total = 0;

  while (i < bench_limit) {
    total = total + inc(i);
    i = i + 1;
  }

  printf("%d\n", total);
  return 0;
}

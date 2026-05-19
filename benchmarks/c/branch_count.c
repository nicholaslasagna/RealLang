#include <stdio.h>

static volatile int bench_limit = 10000000;

int main(void) {
  volatile int i = 0;
  volatile int count = 0;

  while (i < bench_limit) {
    if ((i / 2) * 2 == i) {
      count = count + 1;
    } else {
      count = count + 0;
    }
    i = i + 1;
  }

  printf("%d\n", count);
  return 0;
}

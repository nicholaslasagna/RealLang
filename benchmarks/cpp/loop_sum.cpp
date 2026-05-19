#include <cstdio>

static volatile int bench_limit = 50000;

int main() {
  volatile int i = 0;
  volatile int total = 0;

  while (i < bench_limit) {
    total = total + i;
    i = i + 1;
  }

  std::printf("%d\n", total);
  return 0;
}

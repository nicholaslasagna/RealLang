#include <cstdio>

static int fib(int n) {
  if (n < 2) {
    return n;
  }
  return fib(n - 1) + fib(n - 2);
}

int main() {
  std::printf("%d\n", fib(35));
  return 0;
}

function scrollToTop() {

  // button scroll to top
  const backToTopButton = document.querySelector('#scroll-to-top');

  // eslint-disable-next-line no-use-before-define
  window.addEventListener('scroll', scrollFunction);

  function scrollFunction() {
    if (window.scrollY > 500) { // Show backToTopButton
      if (!backToTopButton.classList.contains('btn-entrance')) {
        backToTopButton.classList.remove('btn-exit');
        backToTopButton.classList.add('btn-entrance');
        backToTopButton.style.display = 'block';
      }
    } else { // Hide backToTopButton
      // eslint-disable-next-line no-lonely-if
      if (backToTopButton.classList.contains('btn-entrance')) {
        backToTopButton.classList.remove('btn-entrance');
        backToTopButton.classList.add('btn-exit');
        // eslint-disable-next-line func-names
        setTimeout(function () {
          backToTopButton.style.display = 'none';
        }, 250);
      }
    }
  }

  // eslint-disable-next-line no-use-before-define
  backToTopButton.addEventListener('click', smoothScrollBackToTop);

  // function backToTop() {
  //   window.scrollTo(0, 0);
  // }

  function smoothScrollBackToTop() {
    const targetPosition = 0;
    const startPosition = window.scrollY;
    const distance = targetPosition - startPosition;
    const duration = 750;
    let start = null;

    // eslint-disable-next-line no-use-before-define
    window.requestAnimationFrame(step);

    function step(timestamp) {
      if (!start) start = timestamp;
      const progress = timestamp - start;
      // eslint-disable-next-line no-use-before-define
      window.scrollTo(0, easeInOutCubic(progress, startPosition, distance, duration));
      if (progress < duration) window.requestAnimationFrame(step);
    }
  }

  function easeInOutCubic(t, b, c, d) {
    // eslint-disable-next-line no-param-reassign
    t /= d / 2;
    if (t < 1) return c / 2 * t * t * t + b;
    // eslint-disable-next-line no-param-reassign
    t -= 2;
    return c / 2 * (t * t * t + 2) + b;
  }
}

module.exports = scrollToTop;

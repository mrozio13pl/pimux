const EASE = (t: number) => 1 - (1 - t) ** 3;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const RISE = 0.82;
const DRIFT = 0.055;
const DRIFT_MAX = 34;

export function mountParallax(el: HTMLElement) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let visible = true;
    let queued = false;

    const update = () => {
        queued = false;
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;

        const enter = clamp((vh - rect.top) / (vh * RISE), 0, 1);
        const centre = rect.top + rect.height / 2;
        const drift = clamp((centre - vh / 2) * DRIFT, -DRIFT_MAX, DRIFT_MAX);

        el.style.setProperty('--enter', EASE(enter).toFixed(4));
        el.style.setProperty('--drift', drift.toFixed(2));
    };

    const request = () => {
        if (queued || !visible) return;
        queued = true;
        requestAnimationFrame(update);
    };

    new IntersectionObserver(
        ([entry]) => {
            visible = entry.isIntersecting;
            if (visible) request();
        },
        { rootMargin: '250px 0px' },
    ).observe(el);

    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });

    update();
    el.dataset.parallax = '';
}

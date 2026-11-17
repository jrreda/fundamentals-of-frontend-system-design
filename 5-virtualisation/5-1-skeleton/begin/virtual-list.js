import { intersectionObserver } from "../../../utils/observer.js";

/**
 * Standard Margin between cards
 * @type {number}
 */
const MARGIN = 16;

/**
 * Returns top and bottom observer elements
 * @returns {[HTMLElement,HTMLElement]}
 */
const getObservers = () => [
  document.getElementById("top-observer"),
  document.getElementById("bottom-observer"),
];

/**
 * Returns a virtual list container
 * @returns {HTMLElement}
 */
function getVirtualList() {
  return document.getElementById("virtual-list");
}

/**
 * Returns a main app container
 * @returns {HTMLElement}
 */
function getContainer() {
  return document.getElementById("container");
}

/**
 * Returns `data-y` attribute of the HTMLElement, if value is provided
 * additionally updates the attribute
 *
 * @param element {HTMLElement}
 * @param value {string | number}
 * @returns {?number}
 */
function y(element, value = undefined) {
  if (value != null) {
    element?.setAttribute("data-y", value);
  }
  const y = element?.getAttribute("data-y");
  if (y !== "" && y != null && +y === +y) {
    return +y;
  }
  return null;
}

/**
 * Returns a CSS Transform Style string to Move Element by certain amount of pixels
 * @param value      - value in pixels
 * @returns {string}
 */
function translateY(value) {
  return `translateY(${value}px)`;
}

/**
 * Starter skeleton
 */
export class VirtualList {
  /**
   * @param root
   * @param props {{
   *     getPage: <T>(p: number) => Promise<T[]>,
   *     getTemplate: <T>(datum: T) => HTMLElement,
   *     updateTemplate: <T>(datum: T, element: HTMLElement) => HTMLElement,
   *     pageSize: number
   * }}
   */
  constructor(root, props) {
    this.props = { ...props };
    this.root = root;
    this.start = 0;
    this.end = 0;
    this.limit = this.props.pageSize * 2;
    this.pool = [];
  }

  /**
   * Returns an HTML Representation of the component, should have the following structure:
   * #container>
   *    #top-observer+
   *    #virtual-list+
   *    #bottom-observer
   * @returns {string}
   */
  toHTML() {
    /**
     * Part 1 - App Skeleton
     */
    return `<div id="container">
      <div id="top-observer">Top Observer</div>
      <div id="virtual-list"></div>
      <div id="bottom-observer">Bottom Observer</div>
    </div>`.trim();
  }

  /**
   * @returns void
   */
  #effect() {
    intersectionObserver(
      getObservers(),
      (entries) => this.#handleIntersectionObserver(entries),
      { threshold: 0.2, rootMargin: '400px' },
    );
  }

  /**
   * @returns void
   */
  render() {
    this.root.innerHTML = this.toHTML();
    this.#effect();
  }

  /**
   * Handles observer intersection entries
   * @param entries {IntersectionObserverEntry[]}
   */
  #handleIntersectionObserver(entries) {
    console.log("Works!", entries);
    for (const entry of entries) {
      if (entry.isIntersecting) {
        if (entry.target.id === "top-observer" && this.start > 0) {
          void this.#handleTopObserver();
        } else if (entry.target.id === "bottom-observer") {
          void this.#handleBottomObserver();
        }
      }
    }
  }

  async #handleBottomObserver() {
    const data = await this.props.getPage(this.end++);
    const container = getContainer();

    if (this.pool.length < this.limit) {
      const list = getVirtualList();
      const fragment = new DocumentFragment();
      for (const datum of data) {
        const card = this.props.getTemplate(datum);
        fragment.appendChild(card);
        this.pool.push(card);
      }

      list.appendChild(fragment);
    } else {
      // split data
      const [toRecycle, unchanged] = [
        this.pool.slice(0, this.props.pageSize),
        this.pool.slice(this.props.pageSize),
      ];

      // switch places
      this.pool = unchanged.concat(toRecycle);

      // update the text content of the recycled data
      this.#updateData(toRecycle, data);

      this.start++;
    }

    this.#updateElementsPosition("down");
    container.style.height = `${container.scrollHeight}px`;
  }

  async #handleTopObserver() {
    // Slide the page window up by one: [start, end) -> [start - 1, end - 1)
    this.start--;
    this.end--;

    const data = await this.props.getPage(this.start);

    // The bottom page left the window, so its cards get reused for the new top page
    const [unchanged, toRecycle] = [
      this.pool.slice(0, this.props.pageSize),
      this.pool.slice(this.props.pageSize),
    ];

    // Move the recycled cards to the front of the pool
    this.pool = toRecycle.concat(unchanged);

    // Fill them with the previous page's data, then place them above the rest
    this.#updateData(toRecycle, data);
    this.#updateElementsPosition("top");
  }

  /**
   * Function uses `props.getTemplate` to update the html elements
   * using provided data
   *
   * @param elements {HTMLElement[]} - HTML Elements to update
   * @param data {T[]} - Data to use for update
   */
  #updateData(elements, data) {
    for (let index = 0; index < data.length; index++) {
      this.props.updateTemplate(data[index], elements[index]);
    }
  }

  /**
   * Move elements on the screen using CSS Transform
   *
   * @param direction {"top" | "down" }
   */
  #updateElementsPosition(direction) {
    const [topObserver, bottomObserver] = getObservers();
    const cards = this.pool;
    if (cards.length === 0) return;

    // Read all heights up front, so the style writes below don't force a layout on every card
    const cardHeights = cards.map(
      (card) => card.getBoundingClientRect().height,
    );

    if (direction === "down") {
      // The first card is the anchor: keep its Y, or start at 0 on the first render
      const anchorY = y(cards[0]) ?? 0;
      y(cards[0], anchorY);
      cards[0].style.transform = translateY(anchorY);

      // Stack each following card right below the previous one
      for (let index = 1; index < cards.length; index++) {
        const previousCard = cards[index - 1];
        const cardY = y(previousCard) + cardHeights[index - 1] + MARGIN * 2;
        y(cards[index], cardY);
        cards[index].style.transform = translateY(cardY); // transform runs on the GPU, no reflow
      }
    } else if (direction === "top") {
      // Only the recycled cards (first page of the pool) move; the rest keep their Y.
      // Walk backwards so each card is placed right above the one after it
      for (let index = this.props.pageSize - 1; index >= 0; index--) {
        const nextCard = cards[index + 1];
        // Subtract this card's own height, so its bottom edge sits one gap above nextCard
        const cardY = y(nextCard) - cardHeights[index] - MARGIN * 2;
        y(cards[index], cardY);
        cards[index].style.transform = translateY(cardY);
      }
    }

    // Keep the observers at the edges of the rendered cards
    const lastIndex = cards.length - 1;
    const topObserverY = y(cards[0]);
    const bottomObserverY =
      y(cards[lastIndex]) + cardHeights[lastIndex] + MARGIN * 2;
    topObserver.style.transform = translateY(topObserverY);
    bottomObserver.style.transform = translateY(bottomObserverY);
  }
}

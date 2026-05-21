const emptyPane = {
  title: "Empty Pane",
  summary: "This pane has no tabs. Use the file tree, command palette, or new-tab command to place a screen here.",
  cards: [
    ["Tiling leaf", "The pane remains as a valid tile even without tabs."],
    ["Ready", "New tabs and notes can be opened into this empty leaf."],
    ["Close", "Close the pane itself when the layout has another pane."]
  ]
};

export function EmptyPaneRenderer() {
  return (
    <article className="viewer" tabIndex={0}>
      <h1>{emptyPane.title}</h1>
      <p>{emptyPane.summary}</p>
      <div className="meta-grid">
        {emptyPane.cards.map(([title, body]: string[]) => (
          <div className="meta-card" key={title}>
            <strong>{title}</strong>
            <span>{body}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

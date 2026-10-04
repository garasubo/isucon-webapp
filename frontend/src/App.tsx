import { Link, Route, Switch } from "wouter";
import Header from "./components/Header";
import { cardClass, pageClass } from "./components/ui";
import Index from "./routes/Index";
import Task from "./routes/Task";

const NotFound = () => (
  <main className={pageClass}>
    <section className={`${cardClass} flex flex-col gap-2 px-6 py-5`}>
      <h1 className="m-0 text-base font-semibold">ページが見つかりません</h1>
      <Link
        href="/"
        className="self-start text-sm font-semibold text-accent no-underline hover:text-accent-hover"
      >
        タスク一覧に戻る
      </Link>
    </section>
  </main>
);

export default function App() {
  return (
    <>
      <Header />
      <Switch>
        <Route path="/" component={Index} />
        <Route path="/task/:id">
          {/* Remount per id so a stale task isn't shown while loading */}
          {(params) => <Task key={params.id} />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

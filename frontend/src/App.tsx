import { Route, Switch } from "wouter";
import { Container, Navbar } from "react-bootstrap";
import Index from "./routes/Index";
import Task from "./routes/Task";

export default function App() {
  return (
    <>
      <Navbar expand="lg" className="bg-body-tertiary">
        <Container>
          <Navbar.Brand href="/">ISUCON14 Deploy Server</Navbar.Brand>
        </Container>
      </Navbar>
      <main>
        <Switch>
          <Route path="/" component={Index} />
          <Route path="/task/:id">
            {/* Remount per id so a stale task isn't shown while loading */}
            {(params) => <Task key={params.id} />}
          </Route>
          <Route>
            <p>Not Found</p>
          </Route>
        </Switch>
      </main>
    </>
  );
}

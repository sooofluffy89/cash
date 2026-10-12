/** Only the newest still-relevant read may publish its result. Writes keep their original request ID. */
export class LatestRead {
  private sequence = 0;
  begin() { return ++this.sequence; }
  invalidate() { ++this.sequence; }
  current(ticket: number) { return ticket === this.sequence; }
}

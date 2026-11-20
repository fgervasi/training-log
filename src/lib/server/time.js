const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' });
/** YYYY-MM-DD in Zürcher Zeit */
export const localDate = (d) => fmt.format(d);

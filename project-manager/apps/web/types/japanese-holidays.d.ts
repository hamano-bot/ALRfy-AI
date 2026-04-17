declare module "japanese-holidays" {
  const JapaneseHolidays: {
    isHolidayAt: (date: Date, furikae?: boolean) => string | undefined;
  };
  export default JapaneseHolidays;
}

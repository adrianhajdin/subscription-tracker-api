import dayjs from "dayjs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { serve } = require("@upstash/workflow/express");
import Subscription from "../models/subscription.model.js";
import { sendReminderEmail } from "../utils/send-email.js";

const REMINDERS = [7, 5, 2, 1]; // IN DAYS

export const sendReminders = serve(async (context) => {
  const { subscriptionId } = context.requestPayload;
  const subscription = await fetchSubscription(context, subscriptionId);

  if (!subscription || subscription.status !== "active") return; // STOP WORKFLOW IF SUBSCRIPTION IS NOT ACTIVE

  const renewalDate = dayjs(subscription.renewalDate);

  // STOP WORKFLOW IF RENEWAL DATE HAS PASSED
  if (renewalDate.isBefore(dayjs())) {
    console.log(
      `Renewal date has passed for subscription ${subscriptionId}. Stopping workflow...`
    );
    return;
  }

  for (const daysBefore of REMINDERS) {
    const reminderDate = renewalDate.subtract(daysBefore, "day");

    // SEND REMINDERS UNTIL RENEWAL DATE
    if (reminderDate.isAfter(dayjs())) {
      await sleepUntilReminder(
        context,
        `Reminder ${daysBefore} days before`,
        reminderDate
      );
    }

    // TRIGGER REMINDER ON RENEWAL DATE
    if (dayjs().isSame(reminderDate, "day")) {
      await triggerReminder(
        context,
        `${daysBefore} days before reminder`,
        subscription
      );
    }
  }
});

const fetchSubscription = async (context, subscriptionId) => {
  return await context.run("get subscription", async () => {
    return Subscription.findById(subscriptionId).populate("user", "name email");
  });
};

const sleepUntilReminder = async (context, label, date) => {
  const now = dayjs();
  const delayInSeconds = date.diff(now, "second");

  // QStash MAX_DELAY is 11.5 days
  if (delayInSeconds > 1_000_000) {
    // IF REMINDER IS MORE THAN 11.5 DAYS, SKIP SLEEP
    console.warn(
      `Skipping sleep for ${label} because it's beyond QStash max delay (11.5 days).`
    );
    return;
  }

  console.log(`Sleeping until ${label} reminder at ${date}`);
  await context.sleepUntil(label, date.toDate()); // SLEEP UNTIL RENEWAL DATE
};

const triggerReminder = async (context, label, subscription) => {
  return await context.run(label, async () => {
    console.log(`Triggering ${label} reminder`);

    await sendReminderEmail({
      to: subscription.user.email,
      type: label,
      subscription,
    });
  });
};

package com.emcom.android.ui.navigation

object Routes {
    const val SETUP = "setup"
    const val MAIN = "main"
    const val EMAIL_DETAIL = "email/{emailId}"
    const val COMPOSE = "compose?replyTo={replyTo}"
    const val THREAD = "thread/{threadId}"
    const val WHO = "who"
    const val SEARCH = "search"

    fun emailDetail(emailId: String) = "email/$emailId"
    fun compose(replyTo: String? = null) =
        if (replyTo != null) "compose?replyTo=$replyTo" else "compose"
    fun thread(threadId: String) = "thread/$threadId"
}

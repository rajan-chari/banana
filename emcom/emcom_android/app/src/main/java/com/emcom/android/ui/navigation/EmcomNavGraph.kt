package com.emcom.android.ui.navigation

import androidx.compose.runtime.*
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.emcom.android.data.repository.EmcomRepository
import com.emcom.android.ui.compose.ComposeScreen
import com.emcom.android.ui.compose.ComposeViewModel
import com.emcom.android.ui.email.EmailDetailScreen
import com.emcom.android.ui.email.EmailDetailViewModel
import com.emcom.android.ui.inbox.InboxScreen
import com.emcom.android.ui.inbox.InboxViewModel
import com.emcom.android.ui.search.SearchScreen
import com.emcom.android.ui.search.SearchViewModel
import com.emcom.android.ui.setup.SetupScreen
import com.emcom.android.ui.setup.SetupViewModel
import com.emcom.android.ui.thread.ThreadScreen
import com.emcom.android.ui.thread.ThreadViewModel
import com.emcom.android.ui.who.WhoScreen
import com.emcom.android.ui.who.WhoViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider

@Composable
fun EmcomNavGraph(
    navController: NavHostController,
    repository: EmcomRepository,
    startDestination: String,
    identityName: String
) {
    NavHost(navController = navController, startDestination = startDestination) {

        composable(Routes.SETUP) {
            val vm = viewModel<SetupViewModel>(factory = factory { SetupViewModel(repository) })
            SetupScreen(vm) {
                navController.navigate(Routes.MAIN) {
                    popUpTo(Routes.SETUP) { inclusive = true }
                }
            }
        }

        composable(Routes.MAIN) {
            val vm = viewModel<InboxViewModel>(factory = factory { InboxViewModel(repository) })
            InboxScreen(
                viewModel = vm,
                identityName = identityName,
                onEmailClick = { navController.navigate(Routes.emailDetail(it)) },
                onThreadClick = { navController.navigate(Routes.thread(it)) },
                onCompose = { navController.navigate(Routes.compose()) },
                onWho = { navController.navigate(Routes.WHO) },
                onSearch = { navController.navigate(Routes.SEARCH) },
                onLogout = {
                    navController.navigate(Routes.SETUP) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(
            Routes.EMAIL_DETAIL,
            arguments = listOf(navArgument("emailId") { type = NavType.StringType })
        ) { backStackEntry ->
            val emailId = backStackEntry.arguments?.getString("emailId") ?: return@composable
            val vm = viewModel<EmailDetailViewModel>(
                factory = factory { EmailDetailViewModel(repository, emailId) }
            )
            EmailDetailScreen(
                viewModel = vm,
                onBack = { navController.popBackStack() },
                onReply = { navController.navigate(Routes.compose(replyTo = it)) }
            )
        }

        composable(
            Routes.COMPOSE,
            arguments = listOf(
                navArgument("replyTo") { type = NavType.StringType; defaultValue = "" }
            )
        ) { backStackEntry ->
            val replyTo = backStackEntry.arguments?.getString("replyTo")?.ifBlank { null }
            val vm = viewModel<ComposeViewModel>(
                factory = factory { ComposeViewModel(repository, replyTo) }
            )
            ComposeScreen(
                viewModel = vm,
                onBack = { navController.popBackStack() },
                onSent = { navController.popBackStack() }
            )
        }

        composable(
            Routes.THREAD,
            arguments = listOf(navArgument("threadId") { type = NavType.StringType })
        ) { backStackEntry ->
            val threadId = backStackEntry.arguments?.getString("threadId") ?: return@composable
            val vm = viewModel<ThreadViewModel>(
                factory = factory { ThreadViewModel(repository, threadId) }
            )
            ThreadScreen(
                viewModel = vm,
                onBack = { navController.popBackStack() },
                onReply = { navController.navigate(Routes.compose(replyTo = it)) }
            )
        }

        composable(Routes.WHO) {
            val vm = viewModel<WhoViewModel>(factory = factory { WhoViewModel(repository) })
            WhoScreen(vm, onBack = { navController.popBackStack() })
        }

        composable(Routes.SEARCH) {
            val vm = viewModel<SearchViewModel>(factory = factory { SearchViewModel(repository) })
            SearchScreen(
                viewModel = vm,
                onBack = { navController.popBackStack() },
                onEmailClick = { navController.navigate(Routes.emailDetail(it)) }
            )
        }
    }
}

/** Simple ViewModel factory helper */
@Suppress("UNCHECKED_CAST")
private inline fun <reified T : ViewModel> factory(crossinline create: () -> T): ViewModelProvider.Factory {
    return object : ViewModelProvider.Factory {
        override fun <V : ViewModel> create(modelClass: Class<V>): V = create() as V
    }
}

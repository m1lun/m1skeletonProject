package com.example.cpen321application.feed

import com.example.cpen321application.auth.SessionExpiredException
import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private fun listing(id: String, photoId: String? = null) = FeedListing(
    id = id,
    category = "furniture",
    price = 40.0,
    condition = "good",
    description = "A sturdy desk",
    photoId = photoId
)

// Serves fixed pages keyed by the `before` cursor, and records each request.
private class FakeSource(private val pages: Map<String?, FeedPage>) : FeedSource {
    val requested = mutableListOf<String?>()
    var failWith: Exception? = null

    override suspend fun page(before: String?): FeedPage {
        requested += before
        failWith?.let { throw it }
        return pages.getValue(before)
    }
}

class FeedModelTest {
    @Test
    fun parsesAFeedPage() {
        val page = parseFeedPage(
            """
            {"listings":[
               {"id":"a2","ownerId":"u2","category":"furniture","price":40,"condition":"good",
                "description":"A sturdy desk","address":"6335 Thunderbird Cres","status":"open",
                "photoIds":["p1","p2"]},
               {"id":"a1","ownerId":"u2","category":"furniture","price":40,"condition":"good",
                "description":"A sturdy desk","address":"6335 Thunderbird Cres","status":"open",
                "photoIds":[]}],
             "nextCursor":"a1"}
            """.trimIndent()
        )

        assertEquals(listOf(listing("a2", photoId = "p1"), listing("a1")), page.listings)
        assertEquals("a1", page.nextCursor)
    }

    @Test
    fun parsesTheLastPage() {
        val page = parseFeedPage("""{"listings":[],"nextCursor":null}""")

        assertTrue(page.listings.isEmpty())
        assertNull(page.nextCursor)
    }

    @Test
    fun loadsPagesInOrderUntilTheEnd() = runBlocking {
        val source = FakeSource(
            mapOf(
                null to FeedPage(listOf(listing("c"), listing("b")), nextCursor = "b"),
                "b" to FeedPage(listOf(listing("a")), nextCursor = null)
            )
        )
        val model = FeedModel(source)

        model.loadMore()
        model.loadMore()
        model.loadMore()

        assertEquals(listOf("c", "b", "a"), model.state.listings.map { it.id })
        assertTrue(model.state.endReached)
        // The third call is skipped: the last page was already loaded.
        assertEquals(listOf(null, "b"), source.requested)
    }

    @Test
    fun aFailedLoadCanBeRetried() = runBlocking {
        val source = FakeSource(mapOf(null to FeedPage(listOf(listing("a")), nextCursor = null)))
        source.failWith = IOException("Backend unreachable")
        val model = FeedModel(source)

        model.loadMore()
        assertTrue(model.state.loadFailed)
        assertFalse(model.state.isLoading)

        source.failWith = null
        model.loadMore()
        assertFalse(model.state.loadFailed)
        assertEquals(listOf("a"), model.state.listings.map { it.id })
    }

    @Test
    fun anExpiredSessionSignsTheUserOut() = runBlocking {
        val source = FakeSource(emptyMap())
        source.failWith = SessionExpiredException("Signed out")
        val model = FeedModel(source)

        model.loadMore()

        assertTrue(model.state.signedOut)
        assertFalse(model.state.loadFailed)
    }

    @Test
    fun refreshStartsFromTheNewestPage() = runBlocking {
        val source = FakeSource(mapOf(null to FeedPage(listOf(listing("a")), nextCursor = null)))
        val model = FeedModel(source)

        model.loadMore()
        model.refresh()

        assertEquals(listOf("a"), model.state.listings.map { it.id })
        assertEquals(listOf(null, null), source.requested)
    }
}
